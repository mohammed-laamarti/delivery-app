package com.delivery.delivery_app;

import java.util.TimeZone;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class DeliveryAppApplication {
	/** Morocco returned to legal GMT on 20 September 2026. */
	private static final String MOROCCO_LEGAL_TIME_ZONE = "UTC";

	public static void main(String[] args) {
		// Do not rely on a container's bundled Africa/Casablanca tzdata: an older
		// image still applies the former UTC+1 rule and writes wrong LocalDateTime values.
		TimeZone.setDefault(TimeZone.getTimeZone(MOROCCO_LEGAL_TIME_ZONE));
		SpringApplication.run(DeliveryAppApplication.class, args);
	}

}
