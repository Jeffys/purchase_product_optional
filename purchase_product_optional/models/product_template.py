# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models

class ProductTemplate(models.Model):
    _inherit = 'product.template'
    """
    Inherit the model product.template to add custom functionality.
    """

    def convert_price(self, price, from_currency):
        """
        Convert the price from one currency to another.
        
        :param price: The amount in the original currency
        :param from_currency: ID of the original currency
        :return: The converted price in the target currency
        """
        currency_obj = self.env['res.currency']
        from_currency = currency_obj.browse(from_currency)
        get_param = self.env['ir.config_parameter'].sudo().get_param
        to_currency_id = int(get_param('currency_id'))
        to_currency = currency_obj.browse(to_currency_id)
        if from_currency.id == to_currency_id:
            return price
        price = from_currency._convert(
            from_amount=price,
            to_currency=to_currency,
        )
        return price
