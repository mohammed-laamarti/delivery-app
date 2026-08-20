package com.delivery.delivery_app.config;

import javax.sql.DataSource;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
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
            jdbcTemplate.execute("ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_status_check");
            jdbcTemplate.execute("""
                    ALTER TABLE packages ADD CONSTRAINT packages_status_check CHECK (status IN (
                        'TO_CONFIRM', 'TO_RECEIVE', 'AT_AGENCY', 'TO_DELIVER', 'ASSIGNED',
                        'IN_DELIVERY', 'AT_DEPOT', 'DELIVERED', 'POSTPONED', 'RETURNED', 'CANCELLED'
                    ))
                    """);
            jdbcTemplate.update("""
                    UPDATE packages
                    SET status = 'TO_CONFIRM', updated_at = CURRENT_TIMESTAMP
                    WHERE status = 'TO_DELIVER' AND driver_id IS NULL
                    """);
        };
    }
}
