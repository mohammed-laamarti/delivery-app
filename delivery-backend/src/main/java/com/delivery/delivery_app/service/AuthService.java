package com.delivery.delivery_app.service;

import com.delivery.delivery_app.dto.LoginRequest;
import com.delivery.delivery_app.dto.LoginResponse;
import com.delivery.delivery_app.security.JwtService;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
    private final UserService userService;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(UserService userService, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.userService = userService;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public LoginResponse login(LoginRequest request) {
        var user = userService.findEntityByPhone(request.phone());
        if (!user.isActive() || !passwordEncoder.matches(request.password(), user.getPassword())) {
            throw new BadCredentialsException("Telephone ou mot de passe incorrect");
        }
        return new LoginResponse(jwtService.generate(user.getId(), user.getPhone(), user.getRole().name()),
                user.getId(), user.getName(), user.getRole());
    }
}
