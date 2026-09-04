package com.delivery.delivery_app.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.delivery.delivery_app.dto.LoginRequest;
import com.delivery.delivery_app.entity.UserEntity;
import com.delivery.delivery_app.enums.Role;
import com.delivery.delivery_app.security.JwtService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;

class AuthServiceTest {
    private final UserService userService = mock(UserService.class);
    private final PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
    private final JwtService jwtService = mock(JwtService.class);
    private final AuthService service = new AuthService(userService, passwordEncoder, jwtService);

    @Test
    void acceptsAnActiveAccountAmongDisabledDuplicates() {
        UserEntity disabled = user(1L, false, "old-hash");
        UserEntity active = user(2L, true, "current-hash");
        when(userService.findEntitiesByPhone("+212 6 12 34 56 78")).thenReturn(List.of(disabled, active));
        when(passwordEncoder.matches("secret", "current-hash")).thenReturn(true);
        when(jwtService.generate(2L, "0612345678", "DRIVER")).thenReturn("token");

        var response = service.login(new LoginRequest("+212 6 12 34 56 78", "secret"));

        assertEquals(2L, response.userId());
        verify(passwordEncoder).matches("secret", "current-hash");
    }

    @Test
    void explainsWhenEveryMatchingAccountIsDisabled() {
        when(userService.findEntitiesByPhone("0612345678")).thenReturn(List.of(user(1L, false, "hash")));

        var error = assertThrows(AccessDeniedException.class,
                () -> service.login(new LoginRequest("0612345678", "secret")));

        assertEquals("Ce compte est désactivé. Contactez l’administrateur.", error.getMessage());
    }

    @Test
    void rejectsAnIncorrectPasswordForAnActiveAccount() {
        when(userService.findEntitiesByPhone("0612345678")).thenReturn(List.of(user(1L, true, "hash")));
        when(passwordEncoder.matches("wrong", "hash")).thenReturn(false);

        assertThrows(BadCredentialsException.class,
                () -> service.login(new LoginRequest("0612345678", "wrong")));
    }

    private UserEntity user(Long id, boolean active, String password) {
        return new UserEntity(id, "Livreur", "0612345678", password, Role.DRIVER, active);
    }
}
