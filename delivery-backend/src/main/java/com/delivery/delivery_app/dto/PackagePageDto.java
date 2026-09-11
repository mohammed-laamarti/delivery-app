package com.delivery.delivery_app.dto;

import java.util.List;

/** A bounded slice of parcels so one request never grows with the whole database. */
public record PackagePageDto(List<PackageDto> items, long totalItems, int page, int totalPages) {
}
