<?php
/**
 * Plugin Name: Etimaad for WooCommerce
 * Description: Sends order outcomes to Etimaad and runs the COD risk check at checkout.
 * Version: 0.0.1
 * Requires PHP: 7.4
 * Requires Plugins: woocommerce
 * Text Domain: etimaad
 * License: Proprietary
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'ETIMAAD_VERSION', '0.0.1' );
define( 'ETIMAAD_PLUGIN_FILE', __FILE__ );

// Declare HPOS compatibility (blueprint section 19.2).
add_action(
	'before_woocommerce_init',
	function () {
		if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', ETIMAAD_PLUGIN_FILE, true );
		}
	}
);
