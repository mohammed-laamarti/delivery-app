package com.delivery.delivery_app.dto;

import com.delivery.delivery_app.enums.Role;

public record UserRequest(String name, String phone, String password, Role role, boolean active) {
}
