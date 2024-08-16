# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
import logging

from odoo import api, fields, models, _
from odoo.addons.base.models.res_partner import WARNING_MESSAGE, WARNING_HELP
from odoo.exceptions import ValidationError
from odoo.tools.float_utils import float_round

_logger = logging.getLogger(__name__)


class ProductTemplate(models.Model):
    _inherit = 'product.template'
    
    global update_price
    def update_price(self, price, selected_currency_id):
        id_vendor = ''
        try:
            id_vendor = self.env.context['partner_id']
            price = self.standard_price
            currency_id  = self.currency_id.id
            
            # Get supplier information
            supplierinfo_template_ids = self.seller_ids.ids
            supplierinfo_records = self.env['product.supplierinfo'].search_read(
                [('id', 'in', supplierinfo_template_ids)],  # Domain to filter records
                ['id', 'partner_id', 'price', 'currency_id' ]  # Fields to read
            )
            partner_id = self.env['res.partner'].search([('id', '=', id_vendor)], [])

            # Create dictionaries for easy look-up
            partner_to_price = {item['partner_id'][0]: item['price'] for item in supplierinfo_records}
            partner_to_currency_id = {item['partner_id'][0]: item['currency_id'] for item in supplierinfo_records}
            search_id = id_vendor

            # The correct price and currency based on partner ID 
            if search_id in partner_to_price:
                price = partner_to_price[search_id]
            if search_id in partner_to_currency_id:
                currency_id = partner_to_currency_id[search_id][0]               

            # The correct price and currency based standard price , because partner ID not match
            if search_id not in partner_to_price:
                price = self.standard_price
            if search_id not in partner_to_currency_id:
                currency_id = self.currency_id.id               

            # If not have partner ID, use the first supplier info record
            if not id_vendor:
                price = supplierinfo_records[0]['price'] or price
                currency_id = supplierinfo_records[0]['currency_id'][0] or currency_id    

            selected_currency_id = self.env['res.currency'].search([('id', '=', selected_currency_id)], [])
            price = self.currency_id._convert(                  #Default Currency
                    price,                                      #Price
                    selected_currency_id,                       #Selected Currecny
                    self._get_current_company(price=price),     #Company related
                    fields.Date.today()
            )
            return price 
        except: # Controllerr will be skip
            pass

    def _get_combination_info_purchase(self, combination=False, product_id=False, add_qty=1, pricelist=False, parent_combination=False, only_template=False, partner_id=False):
        """ Return info about a given combination.

        Note: this method does not take into account whether the combination is
        actually possible.

        :param combination: recordset of `product.template.attribute.value`

        :param product_id: id of a `product.product`. If no `combination`
            is set, the method will try to load the variant `product_id` if
            it exists instead of finding a variant based on the combination.

            If there is no combination, that means we definitely want a
            variant and not something that will have no_variant set.

        :param add_qty: float with the quantity for which to get the info,
            indeed some pricelist rules might depend on it.

        :param pricelist: `product.pricelist` the pricelist to use
            (can be none, eg. from SO if no partner and no pricelist selected)

        :param parent_combination: if no combination and no product_id are
            given, it will try to find the first possible combination, taking
            into account parent_combination (if set) for the exclusion rules.

        :param only_template: boolean, if set to True, get the info for the
            template only: ignore combination and don't try to find variant

        :return: dict with product/combination info:

            - product_id: the variant id matching the combination (if it exists)

            - product_template_id: the current template id

            - display_name: the name of the combination

            - price: the computed price of the combination, take the catalog
                price if no pricelist is given

            - list_price: the catalog price of the combination, but this is
                not the "real" list_price, it has price_extra included (so
                it's actually more closely related to `lst_price`), and it
                is converted to the pricelist currency (if given)

            - has_discounted_price: True if the pricelist discount policy says
                the price does not include the discount and there is actually a
                discount applied (price < list_price), else False
        """
        self.ensure_one()
        display_name = self.display_name

        display_image = True
        quantity = self.env.context.get('quantity', add_qty)
        product_template = self

        combination = combination or product_template.env['product.template.attribute.value']

        if not product_id and not combination and not only_template:
            combination = product_template._get_first_possible_combination(parent_combination)

        if only_template:
            product = product_template.env['product.product']
        elif product_id and not combination:
            product = product_template.env['product.product'].browse(product_id)
        else:
            product = product_template._get_variant_for_combination(combination)

        if product:
            no_variant_attributes_price_extra = [
                ptav.price_extra for ptav in combination.filtered(
                    lambda ptav:
                        ptav.price_extra and
                        ptav not in product.product_template_attribute_value_ids
                )
            ]
            if no_variant_attributes_price_extra:
                product = product.with_context(
                    no_variant_attributes_price_extra=tuple(no_variant_attributes_price_extra)
                )
            list_price = product.price_compute('list_price')[product.id]
            if pricelist:
                price = product.standard_price
            else:
                price = product.standard_price
            display_image = bool(product.image_128)
            display_name = product.display_name
            price_extra = (product.price_extra or 0.0) + (sum(no_variant_attributes_price_extra) or 0.0)
        else:
            current_attributes_price_extra = [v.price_extra or 0.0 for v in combination]
            product_template = product_template.with_context(current_attributes_price_extra=current_attributes_price_extra)
            price_extra = sum(current_attributes_price_extra)
            list_price = product_template.price_compute('list_price')[product_template.id]
            if pricelist:
                price = product_template.standard_price
            else:
                price = product_template.standard_price
            display_image = bool(product_template.image_128)

            combination_name = combination._get_combination_name()
            if combination_name:
                display_name = "%s (%s)" % (display_name, combination_name)

        if pricelist and pricelist.currency_id != product_template.currency_id:
            list_price = product_template.currency_id._convert(
                list_price, pricelist.currency_id, product_template._get_current_company(pricelist=pricelist),
                fields.Date.today()
            )
            price_extra = product_template.currency_id._convert(
                price_extra, pricelist.currency_id, product_template._get_current_company(pricelist=pricelist),
                fields.Date.today()
            )
        selected_currency_id = self.env['ir.config_parameter'].get_param('currency_id', '')
        price = update_price(self=self ,price =price,selected_currency_id=selected_currency_id)
        # Update currency_id selected
        selected_currency_id = self.env['res.currency'].search([('id', '=', selected_currency_id)], [])
        product_template.currency_id = selected_currency_id   

        price_without_discount = list_price if pricelist and pricelist.discount_policy == 'without_discount' else price
        has_discounted_price = (pricelist or product_template).currency_id.compare_amounts(price_without_discount, price) == 1

        return {
            'product_id': product.id,
            'product_template_id': product_template.id,
            'display_name': display_name,
            'display_image': display_image,
            'price': price,
            'list_price': list_price,
            'price_extra': price_extra,
            'has_discounted_price': has_discounted_price,
        }