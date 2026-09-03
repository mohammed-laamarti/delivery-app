package com.delivery.delivery_app.config;

import javax.sql.DataSource;
import java.util.List;
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
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS store_name VARCHAR(255)");
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS agency_received BOOLEAN NOT NULL DEFAULT FALSE");
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS agency_receiver_driver_id BIGINT");
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS confirmation_channel VARCHAR(20)");
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS confirmation_claimed_at TIMESTAMP");
            jdbcTemplate.execute("ALTER TABLE packages ADD COLUMN IF NOT EXISTS confirmation_follow_up_driver_id BIGINT");
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
            reserveExistingConfirmationFollowUps(jdbcTemplate);
            migrateLegacyStatuses(jdbcTemplate, """
                    UPDATE packages SET status = 'IN_DELIVERY'
                    WHERE status IN ('CLIENT_ABSENT', 'CLIENT_UNREACHABLE', 'REFUSED', 'RETURNING_TO_DEPOT')
                    """);
            migrateLegacyStatuses(jdbcTemplate, """
                    UPDATE package_history SET old_status = 'IN_DELIVERY'
                    WHERE old_status IN ('CLIENT_ABSENT', 'CLIENT_UNREACHABLE', 'REFUSED', 'RETURNING_TO_DEPOT')
                    """);
            migrateLegacyStatuses(jdbcTemplate, """
                    UPDATE package_history SET new_status = 'IN_DELIVERY'
                    WHERE new_status IN ('CLIENT_ABSENT', 'CLIENT_UNREACHABLE', 'REFUSED', 'RETURNING_TO_DEPOT')
                    """);
            migrateLegacyStatuses(jdbcTemplate, "UPDATE packages SET status = 'AT_AGENCY' WHERE status = 'AT_DEPOT'");
            // Existing rows predate delivery_started_at. For those already on tour,
            // updated_at is the only reliable historical marker available.
            jdbcTemplate.update("UPDATE packages SET delivery_started_at = updated_at WHERE status = 'IN_DELIVERY' AND delivery_started_at IS NULL");
            migrateLegacyStatuses(jdbcTemplate, "UPDATE package_history SET old_status = 'AT_AGENCY' WHERE old_status = 'AT_DEPOT'");
            migrateLegacyStatuses(jdbcTemplate, "UPDATE package_history SET new_status = 'AT_AGENCY' WHERE new_status = 'AT_DEPOT'");
            jdbcTemplate.execute("""
                    ALTER TABLE packages ADD CONSTRAINT packages_status_check CHECK (status IN (
                        'TO_CONFIRM', 'NO_ANSWER', 'VOICEMAIL', 'OUT_OF_ZONE', 'TO_RECEIVE', 'AT_AGENCY', 'TO_DELIVER', 'ASSIGNED',
                        'IN_DELIVERY', 'DELIVERED', 'POSTPONED', 'RETURNED', 'RETURN_SHIPPED', 'CANCELLED'
                    ))
                    """);
            jdbcTemplate.execute("""
                    ALTER TABLE package_history ADD CONSTRAINT package_history_old_status_check CHECK (old_status IN (
                        'TO_CONFIRM', 'NO_ANSWER', 'VOICEMAIL', 'OUT_OF_ZONE', 'TO_RECEIVE', 'AT_AGENCY', 'TO_DELIVER', 'ASSIGNED',
                        'IN_DELIVERY', 'DELIVERED', 'POSTPONED', 'RETURNED', 'RETURN_SHIPPED', 'CANCELLED'
                    ))
                    """);
            jdbcTemplate.execute("""
                    ALTER TABLE package_history ADD CONSTRAINT package_history_new_status_check CHECK (new_status IN (
                        'TO_CONFIRM', 'NO_ANSWER', 'VOICEMAIL', 'OUT_OF_ZONE', 'TO_RECEIVE', 'AT_AGENCY', 'TO_DELIVER', 'ASSIGNED',
                        'IN_DELIVERY', 'DELIVERED', 'POSTPONED', 'RETURNED', 'RETURN_SHIPPED', 'CANCELLED'
                    ))
                    """);
            jdbcTemplate.execute("""
                    ALTER TABLE delivery_attempts ADD CONSTRAINT delivery_attempts_result_check CHECK (result IN (
                        'CONFIRMATION_IN_DISTRIBUTION', 'CLIENT_CONFIRMED', 'CLIENT_ABSENT', 'CLIENT_UNREACHABLE', 'ADDRESS_NOT_FOUND',
                        'CLIENT_REQUESTED_POSTPONEMENT', 'DELIVERED', 'REFUSED', 'RETURNED_TO_DEPOT'
                    ))
                    """);
            addPerformanceIndexes(jdbcTemplate);
        };
    }

    /** Indexes used by list, workflow and timeline queries as the database grows. */
    private void addPerformanceIndexes(JdbcTemplate jdbcTemplate) {
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_packages_created_at ON packages (created_at DESC)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_packages_status_created_at ON packages (status, created_at DESC)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_packages_driver_status ON packages (driver_id, status)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_packages_tracking_code ON packages (tracking_code)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_packages_next_confirmation_at ON packages (next_confirmation_at)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_packages_next_delivery_date ON packages (next_delivery_date)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_package_history_package_created ON package_history (package_id, created_at DESC)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_package_history_user_created ON package_history (user_id, created_at DESC)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_delivery_attempts_package_created ON delivery_attempts (package_id, created_at DESC)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_delivery_attempts_driver_created ON delivery_attempts (driver_id, created_at DESC)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_delivery_attempts_created_at ON delivery_attempts (created_at)");
    }

    private void migrateLegacyStatuses(JdbcTemplate jdbcTemplate, String sql) {
        try {
            jdbcTemplate.update(sql);
        } catch (DataIntegrityViolationException ignored) {
            // A fresh database already has the new enum constraint, so it cannot
            // contain any legacy values to convert.
        }
    }

    /** Assigns existing unanswered/voicemail follow-ups to the driver who recorded the result. */
    private void reserveExistingConfirmationFollowUps(JdbcTemplate jdbcTemplate) {
        List<FollowUpCandidate> candidates = jdbcTemplate.query("""
                SELECT id, status FROM packages
                WHERE status IN ('NO_ANSWER', 'VOICEMAIL')
                """, (resultSet, rowNumber) -> new FollowUpCandidate(resultSet.getLong("id"), resultSet.getString("status")));
        for (FollowUpCandidate candidate : candidates) {
            List<Long> driverIds = jdbcTemplate.queryForList("""
                    SELECT user_id FROM package_history
                    WHERE package_id = ? AND new_status = ? AND user_id IS NOT NULL
                    ORDER BY created_at ASC
                    LIMIT 1
                    """, Long.class, candidate.packageId(), candidate.status());
            if (!driverIds.isEmpty()) {
                jdbcTemplate.update("UPDATE packages SET confirmation_follow_up_driver_id = ? WHERE id = ?",
                        driverIds.getFirst(), candidate.packageId());
            }
        }
    }

    private record FollowUpCandidate(Long packageId, String status) { }
}
