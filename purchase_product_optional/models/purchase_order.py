from odoo import api, fields, models, _


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    id_vendor = fields.Char(string='ID')

    @api.onchange('partner_id')
    def onchange_partner_id(self):
        self.id_vendor = self.partner_id.id
