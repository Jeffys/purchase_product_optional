# -*- coding: utf-8 -*-
{
    'name': "Purchase Product Optional",
    'version': '1.0',
    'category': 'VDL',
    'summary': "Optional products feature",
    "author": "Doodex",
    "application": True,
    "sequence": 1,

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
    'license': 'AGPL-3',
}
