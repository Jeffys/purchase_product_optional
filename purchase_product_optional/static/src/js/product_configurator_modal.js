/** @odoo-module */

import ajax from 'web.ajax';
import Dialog from 'web.Dialog';
import OwlDialog from 'web.OwlDialog';
import ServicesMixin from 'web.ServicesMixin';
import VariantMixin from 'purchase_product_optional.VariantMixin';
const rpc = require('web.rpc');

export const OptionalProductsModalPurchase = Dialog.extend(ServicesMixin, VariantMixin, {
    events:  _.extend({}, Dialog.prototype.events, VariantMixin.events, {
        'click a.js_add, a.js_remove': '_onAddOrRemoveOption',
        'click button.js_add_cart_json': 'onClickAddCartJSON',
        'change .in_cart input.js_quantity': '_onChangeQuantity',
        'change .js_raw_price': '_computePriceTotal'
    }),
    init: function (parent, params) {
        this.id_vendor = document.getElementById('id_vendor').value;
        this.price_product_dialog = {};
        this.optionalProductQuantities = {};
        var self = this;
        var options = _.extend({
            size: 'large',
            buttons: [{
                text: params.okButtonText,
                click: this._onConfirmButtonClick,
                classes: 'btn-primary o_purchase_product_optional_edit'
            }, {
                text: params.cancelButtonText,
                click: this._onCancelButtonClick
            }],
            technical: !params.isWebsite,
        }, params || {});
        Dialog.prototype.init.call(this, parent, options);
        this.context = params.context;
        this.rootProduct = params.rootProduct;
        this.container = parent;
        this.pricelistId = params.pricelistId;
        this.previousModalHeight = params.previousModalHeight;
        this.mode = params.mode;
        this.dialogClass = 'oe_advanced_configurator_modal';
        this._productImageField = 'image_128';
        this._opened.then(function () {
            if (self.previousModalHeight) {
                self.$el.closest('.modal-content').css('min-height', self.previousModalHeight + 'px');
            }
        });
    },
    willStart: async function () {
        var self = this;
        this.product_tmpl_id = self.rootProduct.product_id;
        const supplierinfo_id = await this.get_supplierinfo_id();
        this.supplierinfo_id = supplierinfo_id;
        await this.get_product_update_price();
//        await this.get_optional_product_prices();
        self.rootProduct.price = this.price;
        var uri = this._getUri("/purchase_product_optional/show_advanced_configurator");
        var getModalContent = ajax.jsonRpc(uri, 'call', {
            mode: self.mode,
            product_id: self.rootProduct.product_id,
            variant_values: self.rootProduct.variant_values,
            product_custom_attribute_values: self.rootProduct.product_custom_attribute_values,
            pricelist_id: self.pricelistId || false,
            add_qty: self.rootProduct.quantity,
            force_dialog: self.forceDialog,
            no_attribute: self.rootProduct.no_variant_attribute_values,
            custom_attribute: self.rootProduct.product_custom_attribute_values,
            context: _.extend({'quantity': self.rootProduct.quantity}, this.context),
        })
        .then(function (modalContent) {
            if (modalContent) {
                var $modalContent = $(modalContent);
                $modalContent = self._postProcessContent($modalContent);
                self.$content = $modalContent;
            } else {
                self.trigger('options_empty');
                self.preventOpening = true;
            }
        });
        const parentInit = Dialog.prototype.willStart.call(this);
        return Promise.all([getModalContent, parentInit]);
    },
    open: function (options) {
        $('.tooltip').remove(); // remove open tooltip if any to prevent them staying when modal is opened
        var self = this;
        this.appendTo($('<div/>')).then(function () {
            if (!self.preventOpening) {
                self.$modal.find(".modal-body").replaceWith(self.$el);
                self.$modal.attr('open', true);
                self.$modal.appendTo(self.container);
                const modal = new Modal(self.$modal[0], {
                    focus: true,
                });
                modal.show();
                self._openedResolver();
                // Notifies OwlDialog to adjust focus/active properties on owl dialogs
                OwlDialog.display(self);
            }
        });
        if (options && options.shouldFocusButtons) {
            self._onFocusControlButton();
        }
        return self;
    },
    start: function () {
        var def = this._super.apply(this, arguments);
        var self = this;
        this.$el.find('input[name="add_qty"]').val(this.rootProduct.quantity);
        var $products = this.$el.find('tr.js_product');
        _.each($products, function (el) {
            var $el = $(el);
            var uniqueId = self._getUniqueId(el);
            var productId = parseInt($el.find('input.product_id').val(), 10);
            if (productId === self.rootProduct.product_id) {
                self.rootProduct.unique_id = uniqueId;
            } else {
                el.dataset.parentUniqueId = self.rootProduct.unique_id;
            }
        });
        return def.then(function () {
            self._opened.then(function () {
                self.triggerVariantChange(self.$el);
            });
        });
    },
     async get_supplierinfo_id() {
        const domain = [['id', '=', this.product_tmpl_id]];
        const fields = [];
        const product_or_template = await rpc.query({
            model: 'product.template',
            method: 'search_read',
            args: [domain, fields],
        });
        this.standard_price = product_or_template[0].standard_price;
        let supplierinfo_id = product_or_template[0].seller_ids;
        let price = product_or_template[0].seller_ids.price;
        return supplierinfo_id;
    },
    async get_optional_product_prices() {
        let optionalProductPrices = {};

        // Iterate over products in the cart
        await Promise.all(this.$modal.find('tr.js_product').filter(function() {
            return $(this).data('unique-id') && !$(this).data('parent-unique-id');
        }).map(async function () {
            const $product = $(this);
            const parentUniqueId = $product.data('unique-id');
            await Promise.all($product.find(`tr.js_product[data-parent-unique-id="${parentUniqueId}"]`).map(async function () {
                const $subProduct = $(this);
                const productTmplId = parseInt($subProduct.find('input.product_template_id').val(), 10);

                // Fetch product template and supplier info
                let productOrTemplate = await rpc.query('product.template', 'search_read', [
                    [['id', '=', productTmplId]], ['seller_ids', 'standard_price']
                ]);
                let sellerIds = productOrTemplate[0].seller_ids;
                let standardPrice = productOrTemplate[0].standard_price;
                let supplierInfo = await rpc.query('product.supplierinfo', 'search_read', [
                    [['id', 'in', sellerIds]], ['partner_id', 'price']
                ]);

                // Create price mapping
                let arrObj = {};
                supplierInfo.forEach(item => {
                    arrObj[item.partner_id[0]] = item.price;
                });

                let key = self.id_vendor ? self.id_vendor : null;
                let price = standardPrice;
                if (key) {
                    if (arrObj[key]) {
                        price = arrObj[key]; // Set price from arrObj if key is found
                    }
                } else {
                    if (supplierInfo.length > 0) {
                        price = supplierInfo[0].price; // Set to first available price if no specific vendor ID
                    }
                }

                $subProduct.find('.oe_price .oe_currency_value').text(self._priceToStr(price));
                optionalProductPrices[productTmplId] = price;
                self.price_product_dialog[productTmplId] = price; // Add to the dialog's price list
            }).get()); // Ensure the map function returns a promise

        }).get()); // Ensure the map function returns a promise

        return optionalProductPrices;
    },
    async get_product_update_price() {
        let data = this.supplierinfo_id;
        const domain = [['id', '=', data]];
        const fields = [];
        const supplierinfo = await rpc.query({
            model: 'product.supplierinfo',
            method: 'search_read',
            args: [domain, fields],
        });
        const arrObj = {};
        supplierinfo.forEach(item => {
            arrObj[item.partner_id[0]] = item.price;
        });
        const key = this.id_vendor;
        this.price = this.standard_price;
        if (key) {
            for (let dataKey in arrObj) {
                this.price_product_dialog[this.rootProduct.product_id] = arrObj[key];
                if (dataKey == key) {
                    this.price = arrObj[key];
                }
            }
        }
        if (!key) {
            if (supplierinfo) {
                this.price_product_dialog[this.rootProduct.product_id] = supplierinfo[0].price;
                this.price = supplierinfo[0].price;
            }
        }
        return arrObj;
    },
    getAndCreateSelectedProducts: async function () {
        var self = this;
        const products = [];
        let productCustomVariantValues;
        let noVariantAttributeValues;
        for (const product of self.$modal.find('.js_product.in_cart')) {
            var $item = $(product);
            var quantity = parseFloat($item.find('input[name="add_qty"]').val().replace(',', '.') || 1);
            var parentUniqueId = product.dataset.parentUniqueId;
            var uniqueId = product.dataset.uniqueId;
            productCustomVariantValues = $item.find('.custom-attribute-info').data("attribute-value") || self.getCustomVariantValues($item);
            noVariantAttributeValues = $item.find('.no-attribute-info').data("attribute-value") || self.getNoVariantAttributeValues($item);
            const productID = await self.selectOrCreateProduct(
                $item,
                parseInt($item.find('input.product_id').val(), 10),
                parseInt($item.find('input.product_template_id').val(), 10),
                true
            );
            products.push({
                'product_id': productID,
                'product_template_id': parseInt($item.find('input.product_template_id').val(), 10),
                'quantity': quantity,
                'parent_unique_id': parentUniqueId,
                'unique_id': uniqueId,
                'product_custom_attribute_values': productCustomVariantValues,
                'no_variant_attribute_values': noVariantAttributeValues
            });
        }
        return products;
    },
    _postProcessContent: function ($modalContent) {
        var productId = this.rootProduct.product_id;
        $modalContent
            .find('img:first')
            .attr("src", "/web/image/product.product/" + productId + "/image_128");
        if (this.rootProduct &&
                (this.rootProduct.product_custom_attribute_values ||
                 this.rootProduct.no_variant_attribute_values)) {
            var $productDescription = $modalContent
                .find('.main_product')
                .find('td.td-product_name div.text-muted.small > div:first');
            var $updatedDescription = $('<div/>');
            $updatedDescription.append($('<p>', {
                text: $productDescription.text()
            }));
            $.each(this.rootProduct.product_custom_attribute_values, function () {
                if (this.custom_value) {
                    const $customInput = $modalContent
                        .find(".main_product [data-is_custom='True']")
                        .closest(`[data-value_id='${this.custom_product_template_attribute_value_id.res_id}']`);
                    $customInput.attr('previous_custom_value', this.custom_value);
                    VariantMixin.handleCustomValues($customInput);
                }
            });
            $.each(this.rootProduct.no_variant_attribute_values, function () {
                if (this.is_custom !== 'True') {
                    $updatedDescription.append($('<div>', {
                        text: this.attribute_name + ': ' + this.attribute_value_name
                    }));
                }
            });
            $productDescription.replaceWith($updatedDescription);
        }
        return $modalContent;
    },
    _onConfirmButtonClick: function () {
        this.trigger('confirm');
        this.close();
    },
    _onCancelButtonClick: function () {
        this.trigger('back');
        this.close();
    },
    _onAddOrRemoveOption: function (ev) {
        ev.preventDefault();
        var self = this;
        var $target = $(ev.currentTarget);
        var $modal = $target.parents('.oe_advanced_configurator_modal');
        var $parent = $target.parents('.js_product:first');
        $parent.find("a.js_add, span.js_remove").toggleClass('d-none');
        $parent.find(".js_remove");
        var productTemplateId = $parent.find(".product_template_id").val();
        if ($target.hasClass('js_add')) {
            self._onAddOption($modal, $parent, productTemplateId);
        } else {
            self._onRemoveOption($modal, $parent);
        }
        self._computePriceTotal();
    },
    _onAddOption: function ($modal, $parent, productTemplateId) {
        var self = this;
        var $selectOptionsText = $modal.find('.o_select_options');
        var parentUniqueId = $parent[0].dataset.parentUniqueId;
        var $optionParent = $modal.find('tr.js_product[data-unique-id="' + parentUniqueId + '"]');
        $parent.find('.td-product_name').removeAttr("colspan");
        $parent.find('.td-qty').removeClass('d-none');
        var productCustomVariantValues = self.getCustomVariantValues($parent);
        var noVariantAttributeValues = self.getNoVariantAttributeValues($parent);
        if (productCustomVariantValues || noVariantAttributeValues) {
            var $productDescription = $parent
                .find('td.td-product_name div.float-start');
            var $customAttributeValuesDescription = $('<div>', {
                class: 'custom_attribute_values_description text-muted small'
            });
            if (productCustomVariantValues.length !== 0 || noVariantAttributeValues.length !== 0) {
                $customAttributeValuesDescription.append($('<br/>'));
            }
            $.each(productCustomVariantValues, function (){
                $customAttributeValuesDescription.append($('<div>', {
                    text: this.attribute_value_name + ': ' + this.custom_value
                }));
            });
            $.each(noVariantAttributeValues, function (){
                if (this.is_custom !== 'True'){
                    $customAttributeValuesDescription.append($('<div>', {
                        text: this.attribute_name + ': ' + this.attribute_value_name
                    }));
                }
            });
            $productDescription.append($customAttributeValuesDescription);
        }
        var $tmpOptionParent = $optionParent;
        while ($tmpOptionParent.length) {
            $optionParent = $tmpOptionParent;
            $tmpOptionParent = $modal.find('tr.js_product.in_cart[data-parent-unique-id="' + $optionParent[0].dataset.uniqueId + '"]').last();
        }
        $optionParent.after($parent);
        $parent.addClass('in_cart');

        this.selectOrCreateProduct(
            $parent,
            $parent.find('.product_id').val(),
            productTemplateId,
            true
        ).then(function (productId) {
            $parent.find('.product_id').val(productId);

            ajax.jsonRpc(self._getUri("/purchase_product_optional/optional_product_items"), 'call', {
                'product_id': productId,
                'pricelist_id': self.pricelistId || false,
            }).then(function (addedItem) {
                var $addedItem = $(addedItem);
                $modal.find('tr:last').after($addedItem);
                self.$el.find('input[name="add_qty"]').trigger('change');
                self.triggerVariantChange($addedItem);

                $addedItem.filter('.js_product').each(function () {
                    var $el = $(this);
                    var uniqueId = self._getUniqueId(this);
                    var parentQty = $parent.find('input[name="add_qty"]').val();
                    this.dataset.uniqueId = uniqueId;
                    this.dataset.parentUniqueId = parentUniqueId;
                    $el.find('input[name="add_qty"]').val(parentQty);
                });

                if ($selectOptionsText.nextAll('.js_product').length === 0) {
                    $selectOptionsText.hide();
                }
            });
        });
    },
    _onRemoveOption: function ($modal, $parent) {
        var uniqueId = $parent[0].dataset.parentUniqueId;
        var qty = $modal.find('tr.js_product.in_cart[data-unique-id="' + uniqueId + '"]').find('input[name="add_qty"]').val();
        $parent.removeClass('in_cart');
        $parent.find('.td-product_name').attr("colspan", 2);
        $parent.find('.td-qty').addClass('d-none');
        $parent.find('input[name="add_qty"]').val(qty);
        $parent.find('.custom_attribute_values_description').remove();
        $modal.find('.o_select_options').show();
        var productUniqueId = $parent[0].dataset.uniqueId;
        this._removeOptionOption($modal, productUniqueId);
        $modal.find('tr:last').after($parent);
    },
    _removeOptionOption: function ($modal, optionUniqueId) {
        var self = this;
        $modal.find('tr.js_product[data-parent-unique-id="' + optionUniqueId + '"]').each(function () {
            var uniqueId = this.dataset.uniqueId;
            $(this).remove();
            self._removeOptionOption($modal, uniqueId);
        });
    },
    _onChangeCombination: function (ev, $parent, combination) {
        $parent
            .find('.td-product_name .product-name')
            .first()
            .text(combination.display_name);
        VariantMixin._onChangeCombination.apply(this, arguments);
        this._computePriceTotal();
    },
    _onChangeQuantity: function (ev) {
        var $product = $(ev.target.closest('tr.js_product'));
        var qty = parseFloat($(ev.currentTarget).val());
        var uniqueId = $product[0].dataset.uniqueId;
        if ($product.hasClass('main_product')) {
            this.rootProduct.quantity = qty;
        } else {
            this.optionalProductQuantities[uniqueId] = qty;
            this.$el.find('tr.js_product:not(.in_cart)[data-parent-unique-id="' + uniqueId + '"] input[name="add_qty"]').each(function () {
                $(this).val(qty);
            });
        }
        if (this._triggerPriceUpdateOnChangeQuantity()) {
            this.onChangeAddQuantity(ev);
        }
        this.trigger('update_quantity', this.rootProduct.quantity);
        this._computePriceTotal();
    },
    _computePriceTotal: async function () {
        if (this.$modal.find('.js_price_total').length) {
            let totalPrice = 0;
            let mainProductId = this.rootProduct.unique_id;
            let mainProductPrice = this.price;
            const mainProductPriceSelector = `tr.js_product[data-unique-id="${mainProductId}"] .oe_price .oe_currency_value`;
            this.$modal.find(mainProductPriceSelector).text(this._priceToStr(mainProductPrice));
            const parentUniqueId = this.$modal.find(`tr.js_product[data-unique-id="${mainProductId}"]`).data('parent-unique-id');
            let optionalProducts = this.$modal.find('tr.js_product.in_cart');
            let optionalProductPrices = await this.get_optional_product_prices();
            optionalProducts.each(function () {
                let $product = $(this);
                let quantity = parseFloat($product.find('input[name="add_qty"]').val().replace(',', '.') || 1);
                let rawPrice = parseFloat($product.find('.oe_price .oe_currency_value').html()) || 0;
                if ($product.data('parent-unique-id') === parentUniqueId) {
                    let productId = $product.data('unique-id');
                    let optionalPrice = optionalProductPrices[productId] || rawPrice; // Default to rawPrice if no price is found
                    totalPrice += optionalPrice * quantity;
                } else {
                    totalPrice += rawPrice * quantity;
                }
            });
            this.$modal.find('.js_price_total .oe_currency_value').text(this._priceToStr(totalPrice));
        }
    },
    _triggerPriceUpdateOnChangeQuantity: function () {
        return true;
    },
    _getUniqueId: function (el) {
        if (!el.dataset.uniqueId) {
            el.dataset.uniqueId = parseInt(_.uniqueId(), 10);
        }
        return el.dataset.uniqueId;
    },
});
