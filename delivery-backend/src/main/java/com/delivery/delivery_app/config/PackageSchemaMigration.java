package com.delivery.delivery_app.config;

import javax.sql.DataSource;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/** Adds reception columns for databases created before the agency-reception workflow. */
@Configuration
public class PackageSchemaMigration {
    @Bean
    ApplicationRunner addAgencyReceptionColumns(DataSource dataSource) {
        return args -> {
            JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS agency_received BOOLEAN NOT NULL DEFAULT FALSE");
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS agency_receiver_driver_id BIGINT");
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS confirmation_channel VARCHAR(20)");
        };
    }
}
