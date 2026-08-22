package com.delivery.delivery_app.dto;

import com.delivery.delivery_app.enums.PackageStatus;
import java.time.LocalDateTime;

public record PackageHistoryDto(
        Long id,
        Long packageId,
        Long userId,
        String userName,
        PackageStatus oldStatus,
        PackageStatus newStatus,
        String comment,
        LocalDateTime createdAt) {
}
