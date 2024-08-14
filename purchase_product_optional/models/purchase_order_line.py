from odoo import api, fields, models, _


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'
    
    id_vendor = fields.Char(string='ID')
    
    @api.onchange('partner_id')
    def onchange_id_vendor(self):
        self.id_vendor = self.partner_id.id


class PurchaseOrderLiner(models.Model):
    _inherit = 'purchase.order.line'
    
    product_custom_attribute_value_ids = fields.One2many(
        comodel_name='product.attribute.custom.value', inverse_name='purchase_order_line_id',
        string="Custom Values",
        compute='_compute_custom_attribute_values',
        store=True, readonly=False, precompute=True, copy=True)
    # M2M holding the values of product.attribute with create_variant field set to 'no_variant'
    # It allows keeping track of the extra_price associated to those attribute values and add them to the SO line description
    product_no_variant_attribute_value_ids = fields.Many2many(
        comodel_name='product.template.attribute.value',
        string="Extra Values",
        compute='_compute_no_variant_attribute_values',
    product_add_mode = fields.Selection(related='product_id.product_template_id.product_add_mode', depends=['product_template_id']))
    
    @api.depends('product_id')
    def _compute_custom_attribute_values(self):
        for line in self:
            if not line.product_id:
                line.product_custom_attribute_value_ids = False
                continue
            if not line.product_custom_attribute_value_ids:
                continue
            valid_values = line.product_id.product_tmpl_id.valid_product_template_attribute_line_ids.product_template_value_ids
            # remove the is_custom values that don't belong to this template
            for pacv in line.product_custom_attribute_value_ids:
                if pacv.custom_product_template_attribute_value_id not in valid_values:
                    line.product_custom_attribute_value_ids -= pacv

    @api.depends('product_id')
    def _compute_no_variant_attribute_values(self):
        for line in self:
            if not line.product_id:
                line.product_no_variant_attribute_value_ids = False
                continue
            if not line.product_no_variant_attribute_value_ids:
                continue
            valid_values = line.product_id.product_tmpl_id.valid_product_template_attribute_line_ids.product_template_value_ids
            # remove the no_variant attributes that don't belong to this template
            for ptav in line.product_no_variant_attribute_value_ids:
                if ptav._origin not in valid_values:
                    line.product_no_variant_attribute_value_ids -= ptav


class ProductAttributeCustomValue(models.Model):
    _inherit = "product.attribute.custom.value"

    purchase_order_line_id = fields.Many2one('purchase.order.line', string="Purchase Order Line", ondelete='cascade')