FROM eclipse-temurin:21-jdk AS build

WORKDIR /app

COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw dependency:go-offline

COPY src src
RUN ./mvnw clean package -DskipTests

FROM eclipse-temurin:21-jre

WORKDIR /app

# Morocco's legal time is GMT since 20 September 2026. Keep the OS and JVM on
# UTC so an image with stale Africa/Casablanca tzdata cannot introduce UTC+1.
ENV TZ=Etc/UTC

COPY --from=build /app/target/*.jar app.jar

CMD ["sh", "-c", "java -Duser.timezone=UTC -Dserver.port=${PORT:-8080} -jar /app/app.jar"]
