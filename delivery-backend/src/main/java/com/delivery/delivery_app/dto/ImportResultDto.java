package com.delivery.delivery_app.dto;

import java.util.List;

public record ImportResultDto(int imported, int skipped, List<String> errors) {
}
