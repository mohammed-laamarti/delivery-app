package com.delivery.delivery_app.repository;

import com.delivery.delivery_app.entity.PackageEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PackageRepository extends JpaRepository<PackageEntity, Long> {
    Optional<PackageEntity> findByTrackingCode(String trackingCode);

    boolean existsByTrackingCode(String trackingCode);

    List<PackageEntity> findByDriverId(Long driverId);
}
