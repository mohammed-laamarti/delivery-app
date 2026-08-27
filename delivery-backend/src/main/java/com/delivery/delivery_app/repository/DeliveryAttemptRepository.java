package com.delivery.delivery_app.repository;

import com.delivery.delivery_app.entity.DeliveryAttemptEntity;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DeliveryAttemptRepository extends JpaRepository<DeliveryAttemptEntity, Long> {
    List<DeliveryAttemptEntity> findByPackageEntityIdOrderByCreatedAtDesc(Long packageId);
    Optional<DeliveryAttemptEntity> findFirstByPackageEntityIdOrderByCreatedAtDesc(Long packageId);
    long deleteByPackageEntityId(Long packageId);
    List<DeliveryAttemptEntity> findByCreatedAtGreaterThanEqualAndCreatedAtLessThan(LocalDateTime from, LocalDateTime to);
}
