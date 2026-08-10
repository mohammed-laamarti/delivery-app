package com.delivery.delivery_app.dto;

import java.math.BigDecimal;

public record PackageRequest(
        String trackingCode,
        String recipient,
        String phone,
        String city,
        String address,
        BigDecimal price,
        String importComment,
        Long driverId) {
}
