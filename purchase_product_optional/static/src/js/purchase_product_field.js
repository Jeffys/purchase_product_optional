/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { PurchaseOrderLineProductField } from '@purchase_product_matrix/js/purchase_product_field';
import { OptionalProductsModalPurchase } from "@purchase_product_optional/js/product_configurator_modal";
import {
    selectOrCreateProduct,
    getSelectedVariantValues,
    getNoVariantAttributeValues,
} from "purchase_product_optional.VariantMixin";


patch(PurchaseOrderLineProductField.prototype, 'purchase_product_optional', {

    setup() {
        this._super(...arguments);

        this.rpc = useService("rpc");
        this.ui = useService("ui");
        this.orm = useService("orm");
    },

    async _onProductTemplateUpdate() {
        const result = await this.orm.call(
            'product.template',
            'get_single_product_variant',
            [this.props.record.data.product_template_id[0]],
        );

        if(result && result.product_id) {
            if (this.props.record.data.product_id != result.product_id.id) {
                this.props.record.update({
                    // TODO right name get (same problem as configurator)
                    product_id: [result.product_id, 'whatever'],
                });
                if (result.has_optional_products) {
                    this._openProductConfigurator('options');
                }
            }
        } else {
            this._openGridConfigurator(false);
        }
    },

    _editProductConfiguration() {
        this._super(...arguments);
        if (this.props.record.data.is_configurable_product) {
            this._openProductConfigurator('edit');
        }
    },

    get isConfigurableTemplate() {
        return this._super(...arguments) || this.props.record.data.is_configurable_product;
    },

    async _openProductConfigurator(mode) {
        const PurchaseOrderRecord = this.props.record.model.root;
        const pricelistId = PurchaseOrderRecord.data.pricelist_id ? PurchaseOrderRecord.data.pricelist_id[0] : false;
        const productTemplateId = this.props.record.data.product_template_id[0];
        const $modal = $(
            await this.rpc(
                "/purchase_product_optional/configure",
                {
                    product_template_id: productTemplateId,
                    quantity: this.props.record.data.product_qty || 1,
                    pricelist_id: pricelistId,
                    product_template_attribute_value_ids: this.props.record.data.product_template_attribute_value_ids.records.map(
                        record => record.data.id
                    ),
                    product_no_variant_attribute_value_ids: this.props.record.data.product_no_variant_attribute_value_ids.records.map(
                        record => record.data.id
                    ),
                    context: this.context,
                },
            )
        );
        const productSelector = `input[type="hidden"][name="product_id"], input[type="radio"][name="product_id"]:checked`;
        // TODO VFE drop this selectOrCreate and make it so that
        // get_single_product_variant returns first variant as well.
        // and use specified product on edition mode.
        const productId = await selectOrCreateProduct.call(
            this,
            $modal,
            parseInt($modal.find(productSelector).first().val(), 10),
            productTemplateId,
            false
        );
        $modal.find(productSelector).val(productId);
        const variantValues = getSelectedVariantValues($modal);
        const noVariantAttributeValues = getNoVariantAttributeValues($modal);
        /**
         *  `product_custom_attribute_value_ids` records are not loaded in the view bc sub templates
         *  are not loaded in list views. Therefore, we fetch them from the server if the record is
         *  saved. Else we use the value stored on the line.
         */
//        const customAttributeValueRecords = this.props.record.data.product_custom_attribute_value_ids.records;
        let customAttributeValues = [];
//        if (customAttributeValueRecords.length > 0) {
//            if (customAttributeValueRecords[0].isNew) {
//                customAttributeValues = customAttributeValueRecords.map(
//                    record => record.data
//                );
//            } else {
//                customAttributeValues = await this.orm.read(
//                    'product.attribute.custom.value',
//                    this.props.record.data.product_custom_attribute_value_ids.currentIds,
//                    ["custom_product_template_attribute_value_id", "custom_value"]
//                );
//            }
//        }
        const formattedCustomAttributeValues = customAttributeValues.map(
            data => {
                // NOTE: this dumb formatting is necessary to avoid
                // modifying the shared code between frontend & backend for now.
                return {
                    custom_value: data.custom_value,
                    custom_product_template_attribute_value_id: {
                        res_id: data.custom_product_template_attribute_value_id[0],
                    },
                };
            }
        );
        this.rootProduct = {
            product_id: productId,
            product_template_id: productTemplateId,
            quantity: parseFloat($modal.find('input[name="add_qty"]').val() || 1),
            variant_values: variantValues,
            product_custom_attribute_values: formattedCustomAttributeValues,
            no_variant_attribute_values: noVariantAttributeValues,
        };
        const optionalProductsModalPurchase = new OptionalProductsModalPurchase(null, {
            rootProduct: this.rootProduct,
            pricelistId: pricelistId,
            okButtonText: this.env._t("Confirm"),
            cancelButtonText: this.env._t("Back"),
            title: this.env._t("Configure"),
            context: this.context,
            mode: mode,
        });
        let modalEl;
        optionalProductsModalPurchase.opened(() => {
            modalEl = optionalProductsModalPurchase.el;
            this.ui.activateElement(modalEl);
        });
        optionalProductsModalPurchase.on("closed", null, async () => {
            // Wait for the event that caused the close to bubble
            await new Promise(resolve => setTimeout(resolve, 0));
            this.ui.deactivateElement(modalEl);
        });
        optionalProductsModalPurchase.open();

        let confirmed = false;
        optionalProductsModalPurchase.on("confirm", null, async () => {
            confirmed = true;
            const [
                mainProduct,
                ...optionalProducts
            ] = await optionalProductsModalPurchase.getAndCreateSelectedProducts();

            await this.props.record.update(await this._convertConfiguratorDataToUpdateData(mainProduct));
            await this.props.record.update({ product_qty: mainProduct['quantity'] });
            const optionalProductLinesCreationContext = this._convertConfiguratorDataToLinesCreationContext(optionalProducts);

            for (let optionalProductLineCreationContext of optionalProductLinesCreationContext) {
                const line = await PurchaseOrderRecord.data.order_line.addNew({
                    position: 'bottom',
                    context: optionalProductLineCreationContext,
                    mode: 'readonly',  // whatever but not edit !
                });
                // FIXME: update sets the field dirty otherwise on the next edit and click out it gets deleted
                line.update({ sequence: line.data.sequence });
                line.update({ product_qty: optionalProductLineCreationContext['default_product_qty'] });
            }
            PurchaseOrderRecord.data.order_line.unselectRecord();
        });
        optionalProductsModalPurchase.on("closed", null, () => {
            if (confirmed) {
                return;
            }
            if (mode != 'edit') {
                this.props.record.update({
                    product_template_id: false,
                    product_id: false,
                    price_unit: 0,
                    product_qty: 1.0,
                    taxes_id: false
                    // TODO reset custom/novariant values (and remove onchange logic?)
                });
            }
        });
    },

    async _convertConfiguratorDataToUpdateData(mainProduct) {
        const nameGet = await this.orm.nameGet(
            'product.product',
            [mainProduct.product_id],
            { context: this.context }
        );
        let prod_template = [mainProduct.product_template_id, nameGet[0][1]]
        let result = {
            product_id: nameGet[0],
            product_template_id: prod_template,
            product_qty: mainProduct.quantity,
        };
        var customAttributeValues = mainProduct.product_custom_attribute_values;
        var customValuesCommands = [{ operation: "DELETE_ALL" }];
        if (customAttributeValues && customAttributeValues.length !== 0) {
            _.each(customAttributeValues, function (customValue) {
                customValuesCommands.push({
                    operation: "CREATE",
                    context: [
                        {
                            default_custom_product_template_attribute_value_id:
                                customValue.custom_product_template_attribute_value_id,
                            default_custom_value: customValue.custom_value,
                        },
                    ],
                });
            });
        }

        var noVariantAttributeValues = mainProduct.no_variant_attribute_values;
        var noVariantCommands = [{ operation: "DELETE_ALL" }];
        if (noVariantAttributeValues && noVariantAttributeValues.length !== 0) {
            var resIds = _.map(noVariantAttributeValues, function (noVariantValue) {
                return { id: parseInt(noVariantValue.value) };
            });

            noVariantCommands.push({
                operation: "ADD_M2M",
                ids: resIds,
            });
        }

        result.product_no_variant_attribute_value_ids = {
            operation: "MULTI",
            commands: noVariantCommands,
        };

        return result;
    },

    /**
     * Will map the optional producs data to sale.order.line
     * creation contexts.
     *
     * @param {Array} optionalProductsData The optional products data given by the configurator
     *
     * @private
     */
    _convertConfiguratorDataToLinesCreationContext: function (optionalProductsData) {
        return optionalProductsData.map(productData => {
            return {
                default_product_id: productData.product_id,
                default_product_template_id: productData.product_template_id,
                default_product_qty: productData.quantity,
                default_product_no_variant_attribute_value_ids: productData.no_variant_attribute_values.map(
                    noVariantAttributeData => {
                        return [4, parseInt(noVariantAttributeData.value)];
                    }
                ),
            };
        });
    },
});
