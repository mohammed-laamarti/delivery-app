package com.delivery.delivery_app.repository;

import com.delivery.delivery_app.entity.PackageEntity;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import com.delivery.delivery_app.enums.PackageStatus;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PackageRepository extends JpaRepository<PackageEntity, Long> {
    Optional<PackageEntity> findByTrackingCode(String trackingCode);
    List<PackageEntity> findAllByOrderByCreatedAtDesc();
    long countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(LocalDateTime from, LocalDateTime to);

    boolean existsByTrackingCode(String trackingCode);

    List<PackageEntity> findByDriverId(Long driverId);
    List<PackageEntity> findByStatusOrderByCreatedAtDesc(PackageStatus status);
    List<PackageEntity> findByDriverIdAndStatus(Long driverId, PackageStatus status);
}
