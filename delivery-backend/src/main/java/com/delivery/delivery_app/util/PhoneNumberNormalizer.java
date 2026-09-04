package com.delivery.delivery_app.util;

public final class PhoneNumberNormalizer {
    private PhoneNumberNormalizer() {}

    /**
     * Stores and compares Moroccan phone numbers in their national 0XXXXXXXXX form.
     * Formatting characters are ignored so 06 12 34 56 78 and +212612345678
     * identify the same account.
     */
    public static String normalize(String phone) {
        if (phone == null) return null;

        String compact = phone.trim().replaceAll("[\\s().-]", "");
        if (compact.startsWith("00212")) {
            compact = compact.substring(5);
        } else if (compact.startsWith("+212")) {
            compact = compact.substring(4);
        } else if (compact.startsWith("212") && compact.length() == 12) {
            compact = compact.substring(3);
        }

        if (compact.length() == 9 && !compact.startsWith("0")) {
            compact = "0" + compact;
        }
        return compact;
    }
}
