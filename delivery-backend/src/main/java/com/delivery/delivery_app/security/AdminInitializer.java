package com.delivery.delivery_app.security;

import com.delivery.delivery_app.entity.UserEntity;
import com.delivery.delivery_app.enums.Role;
import com.delivery.delivery_app.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;
import com.delivery.delivery_app.util.PhoneNumberNormalizer;

@Configuration
public class AdminInitializer {
    @Bean
    ApplicationRunner createInitialAdmin(UserRepository repository, PasswordEncoder encoder,
            @Value("${app.bootstrap.admin-phone:0600000000}") String phone,
            @Value("${app.bootstrap.admin-password:admin123}") String password) {
        return args -> {
            String normalizedPhone = PhoneNumberNormalizer.normalize(phone);
            if (repository.findAllByPhone(normalizedPhone).isEmpty()) {
                repository.save(new UserEntity(null, "Administrateur", normalizedPhone, encoder.encode(password), Role.ADMIN, true));
            }
        };
    }
}
