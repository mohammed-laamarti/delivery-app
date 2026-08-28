package com.delivery.delivery_app.config;

import javax.sql.DataSource;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

/** Migrates databases created before the confirmation and agency-reception workflow. */
@Configuration
public class PackageSchemaMigration {
    @Bean
    ApplicationRunner addAgencyReceptionColumns(DataSource dataSource) {
        return args -> {
            JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS agency_received BOOLEAN NOT NULL DEFAULT FALSE");
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS agency_receiver_driver_id BIGINT");
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS confirmation_channel VARCHAR(20)");
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS confirmation_claimed_at TIMESTAMP");
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS next_confirmation_at TIMESTAMP");
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS next_delivery_date DATE");
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS returned_to_depot_at TIMESTAMP");
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS delivery_started_at TIMESTAMP");
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS depot_decision_at TIMESTAMP");
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS return_shipment_reference VARCHAR(100)");
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS returned_to_company_at TIMESTAMP");
            jdbcTemplate.execute("ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_status_check");
            jdbcTemplate.execute("ALTER TABLE package_history DROP CONSTRAINT IF EXISTS package_history_old_status_check");
            jdbcTemplate.execute("ALTER TABLE package_history DROP CONSTRAINT IF EXISTS package_history_new_status_check");
            jdbcTemplate.execute("ALTER TABLE delivery_attempts DROP CONSTRAINT IF EXISTS delivery_attempts_result_check");
            migrateLegacyStatuses(jdbcTemplate, """
                    UPDATE packages SET status = 'IN_DELIVERY'
                    WHERE status IN ('CLIENT_ABSENT', 'CLIENT_UNREACHABLE', 'REFUSED', 'OUT_OF_ZONE', 'RETURNING_TO_DEPOT')
                    """);
            migrateLegacyStatuses(jdbcTemplate, """
                    UPDATE package_history SET old_status = 'IN_DELIVERY'
                    WHERE old_status IN ('CLIENT_ABSENT', 'CLIENT_UNREACHABLE', 'REFUSED', 'OUT_OF_ZONE', 'RETURNING_TO_DEPOT')
                    """);
            migrateLegacyStatuses(jdbcTemplate, """
                    UPDATE package_history SET new_status = 'IN_DELIVERY'
                    WHERE new_status IN ('CLIENT_ABSENT', 'CLIENT_UNREACHABLE', 'REFUSED', 'OUT_OF_ZONE', 'RETURNING_TO_DEPOT')
                    """);
            migrateLegacyStatuses(jdbcTemplate, "UPDATE packages SET status = 'AT_AGENCY' WHERE status = 'AT_DEPOT'");
            // Existing rows predate delivery_started_at. For those already on tour,
            // updated_at is the only reliable historical marker available.
            jdbcTemplate.update("UPDATE packages SET delivery_started_at = updated_at WHERE status = 'IN_DELIVERY' AND delivery_started_at IS NULL");
            migrateLegacyStatuses(jdbcTemplate, "UPDATE package_history SET old_status = 'AT_AGENCY' WHERE old_status = 'AT_DEPOT'");
            migrateLegacyStatuses(jdbcTemplate, "UPDATE package_history SET new_status = 'AT_AGENCY' WHERE new_status = 'AT_DEPOT'");
            jdbcTemplate.execute("""
                    ALTER TABLE packages ADD CONSTRAINT packages_status_check CHECK (status IN (
                        'TO_CONFIRM', 'TO_RECEIVE', 'AT_AGENCY', 'TO_DELIVER', 'ASSIGNED',
                        'IN_DELIVERY', 'DELIVERED', 'POSTPONED', 'RETURNED', 'RETURN_SHIPPED', 'CANCELLED'
                    ))
                    """);
            jdbcTemplate.execute("""
                    ALTER TABLE package_history ADD CONSTRAINT package_history_old_status_check CHECK (old_status IN (
                        'TO_CONFIRM', 'TO_RECEIVE', 'AT_AGENCY', 'TO_DELIVER', 'ASSIGNED',
                        'IN_DELIVERY', 'DELIVERED', 'POSTPONED', 'RETURNED', 'RETURN_SHIPPED', 'CANCELLED'
                    ))
                    """);
            jdbcTemplate.execute("""
                    ALTER TABLE package_history ADD CONSTRAINT package_history_new_status_check CHECK (new_status IN (
                        'TO_CONFIRM', 'TO_RECEIVE', 'AT_AGENCY', 'TO_DELIVER', 'ASSIGNED',
                        'IN_DELIVERY', 'DELIVERED', 'POSTPONED', 'RETURNED', 'RETURN_SHIPPED', 'CANCELLED'
                    ))
                    """);
            jdbcTemplate.execute("""
                    ALTER TABLE delivery_attempts ADD CONSTRAINT delivery_attempts_result_check CHECK (result IN (
                        'CLIENT_CONFIRMED', 'CLIENT_ABSENT', 'CLIENT_UNREACHABLE', 'ADDRESS_NOT_FOUND',
                        'CLIENT_REQUESTED_POSTPONEMENT', 'DELIVERED', 'REFUSED', 'RETURNED_TO_DEPOT'
                    ))
                    """);
        };
    }

    private void migrateLegacyStatuses(JdbcTemplate jdbcTemplate, String sql) {
        try {
            jdbcTemplate.update(sql);
        } catch (DataIntegrityViolationException ignored) {
            // A fresh database already has the new enum constraint, so it cannot
            // contain any legacy values to convert.
        }
    }
}
