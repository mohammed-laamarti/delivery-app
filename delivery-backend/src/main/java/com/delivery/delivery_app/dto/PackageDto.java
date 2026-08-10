package com.delivery.delivery_app.dto;

import com.delivery.delivery_app.enums.PackageStatus;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public record PackageDto(
        Long id,
        String trackingCode,
        String recipient,
        String phone,
        String city,
        String address,
        BigDecimal price,
        String importComment,
        PackageStatus status,
        Long driverId,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {
}
