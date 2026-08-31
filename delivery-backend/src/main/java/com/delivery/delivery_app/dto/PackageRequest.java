package com.delivery.delivery_app.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.delivery.delivery_app.enums.PackageStatus;

public record PackageRequest(
        String trackingCode,
        String storeName,
        String recipient,
        String phone,
        String city,
        String address,
        BigDecimal price,
        String importComment,
        Long driverId,
        PackageStatus status,
        LocalDate nextDeliveryDate) {
}
