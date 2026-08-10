package com.delivery.delivery_app.repository;

import com.delivery.delivery_app.entity.DeliveryAttemptEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DeliveryAttemptRepository extends JpaRepository<DeliveryAttemptEntity, Long> {
    List<DeliveryAttemptEntity> findByPackageEntityIdOrderByCreatedAtDesc(Long packageId);
}
