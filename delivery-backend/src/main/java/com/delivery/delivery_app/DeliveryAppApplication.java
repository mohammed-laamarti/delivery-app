package com.delivery.delivery_app;

import java.util.TimeZone;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class DeliveryAppApplication {

	public static void main(String[] args) {
		TimeZone.setDefault(TimeZone.getTimeZone("Africa/Casablanca"));
		SpringApplication.run(DeliveryAppApplication.class, args);
	}

}
