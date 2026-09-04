package com.delivery.delivery_app.service;

import com.delivery.delivery_app.dto.LoginRequest;
import com.delivery.delivery_app.dto.LoginResponse;
import com.delivery.delivery_app.security.JwtService;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.access.AccessDeniedException;
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
        var users = userService.findEntitiesByPhone(request.phone());
        if (users.isEmpty()) {
            throw new BadCredentialsException("Téléphone ou mot de passe incorrect.");
        }

        var activeUsers = users.stream().filter(user -> user.isActive()).toList();
        if (activeUsers.isEmpty()) {
            throw new AccessDeniedException("Ce compte est désactivé. Contactez l’administrateur.");
        }

        var user = activeUsers.stream()
                .filter(candidate -> passwordEncoder.matches(request.password(), candidate.getPassword()))
                .findFirst()
                .orElseThrow(() -> new BadCredentialsException("Téléphone ou mot de passe incorrect."));
        return new LoginResponse(jwtService.generate(user.getId(), user.getPhone(), user.getRole().name()),
                user.getId(), user.getName(), user.getRole());
    }
}
