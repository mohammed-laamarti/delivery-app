package com.delivery.delivery_app.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class JacksonConfig {
    /** Provides the JSON mapper required by the ticket-reading service. */
    @Bean
    public ObjectMapper objectMapper() {
        return new ObjectMapper();
    }
}
