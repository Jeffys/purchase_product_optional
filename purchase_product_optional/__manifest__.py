# -*- coding: utf-8 -*-
{
    'name': "Purchase Product Optional",
    "version": "16.0.1.0.0",
    'summary': "Optional products feature",
    "author": "Doodex",
    "company": "Doodex",
    "website": "https://www.doodex.net/",
    "category": "Tools",
    "application": False,
    'description': """
Technical module:
The main purpose is to enables the "optional products" feature on purchase order.
    """,

    'depends': ['purchase', 'purchase_product_matrix','sale'],
    'data': [
        'views/templates.xml',
    ],
    'demo': [],
    'assets': {
        'web.assets_backend': [
            'purchase_product_optional/static/src/js/variant_mixin.js',
            'purchase_product_optional/static/src/js/purchase_product_field.js',
            'purchase_product_optional/static/src/js/product_configurator_modal.js',
        ],
    },
    'auto_install': True,
    'license': 'LGPL-3',
}
