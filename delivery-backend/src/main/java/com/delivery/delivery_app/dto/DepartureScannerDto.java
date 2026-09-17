package com.delivery.delivery_app.dto;

import java.util.List;

/** Minimal data needed by the admin departure scanner. */
public record DepartureScannerDto(long preparedCount, List<PackageDto> matches) {
}
