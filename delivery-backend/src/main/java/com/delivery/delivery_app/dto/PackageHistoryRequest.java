package com.delivery.delivery_app.dto;

public record PackageHistoryRequest(Long packageId, Long userId, String comment) {
}
