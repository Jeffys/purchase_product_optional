# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name': "Purchase Product Optional",
    'version': '17.0.1.0.0',
    'category': 'Hidden',
    'summary': "Configure your products",
    'author': 'Doodex',
    'images': ['static/description/banner.png'],

    'description': """
Technical module:
The main purpose is to override the sale_order view to allow configuring products in the SO form.

It also enables the "optional products" feature.
    """,

    'depends': ['purchase', 'purchase_product_matrix', 'sale_product_configurator'],
    'data': [
        'views/purchase_order_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'purchase_product_optional/static/src/**/*',
        ],
    },
    'auto_install': True,
    'license': 'LGPL-3',
}
