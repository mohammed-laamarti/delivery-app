package com.delivery.delivery_app.util;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PhoneNumberNormalizerTest {
    @ParameterizedTest
    @ValueSource(strings = {
            "0612345678",
            "06 12 34 56 78",
            "06-12-34-56-78",
            "+212612345678",
            "00212612345678",
            "212612345678"
    })
    void normalizesEquivalentMoroccanPhoneFormats(String phone) {
        assertEquals("0612345678", PhoneNumberNormalizer.normalize(phone));
    }
}
