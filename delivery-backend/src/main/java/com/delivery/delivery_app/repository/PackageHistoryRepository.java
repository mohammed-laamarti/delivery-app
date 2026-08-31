package com.delivery.delivery_app.repository;

import com.delivery.delivery_app.entity.PackageHistoryEntity;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PackageHistoryRepository extends JpaRepository<PackageHistoryEntity, Long> {
    List<PackageHistoryEntity> findByPackageEntityIdOrderByCreatedAtDesc(Long packageId);
    List<PackageHistoryEntity> findByUserIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(
            Long userId, LocalDateTime from, LocalDateTime to);
    long deleteByPackageEntityId(Long packageId);
}
