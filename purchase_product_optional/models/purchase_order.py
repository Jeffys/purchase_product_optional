from odoo import api, fields, models, _


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    @api.onchange('currency_id','partner_id')
    def onchange_partner_id(self):
        if not self.partner_id.id:
            self.env['ir.config_parameter'].set_param('currency_id', self.currency_id.id)
        elif self.partner_id.property_purchase_currency_id == self.currency_id:
            self.currency_id = self.partner_id.property_purchase_currency_id
            self.env['ir.config_parameter'].set_param('currency_id', self.currency_id.id) 
        else:
            self.currency_id = self.currency_id
            self.env['ir.config_parameter'].set_param('currency_id', self.currency_id.id)