from odoo import api, models, _


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'
    """
    Inherit the model purchase.order to add custom onchange functionality.
    """
    @api.onchange('currency_id','partner_id')
    def onchange_partner_id(self):
        """ Update currency based on the partner's purchase currency. """
        if not self.partner_id.id:
            set_param = self.env['ir.config_parameter'].sudo().set_param
            set_param = set_param('currency_id', self.currency_id.id)
        elif self.partner_id.property_purchase_currency_id == self.currency_id:
            self.currency_id = self.partner_id.property_purchase_currency_id
            set_param = self.env['ir.config_parameter'].sudo().set_param
            set_param = set_param('currency_id', self.currency_id.id) 
        else:
            self.currency_id = self.currency_id
            set_param = self.env['ir.config_parameter'].sudo().set_param
            set_param = set_param('currency_id', self.currency_id.id)

