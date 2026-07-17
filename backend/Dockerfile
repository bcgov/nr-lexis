FROM maven:3.9.9-amazoncorretto-21-alpine AS build
WORKDIR /workspace/app

COPY pom.xml .
COPY src src
RUN mvn package -DskipTests
RUN mkdir -p target/dependency && (cd target/dependency; jar -xf ../*.jar)

FROM eclipse-temurin:21.0.9_10-jdk-alpine-3.23

ENV HOME=/tmp \
    XDG_CACHE_HOME=/tmp/.cache

RUN adduser -D -s /bin/sh spring
RUN mkdir -p /logs
RUN chown -R spring:spring /logs
RUN chmod 755 /logs
USER spring
VOLUME /tmp
ARG DEPENDENCY=/workspace/app/target/dependency
COPY --from=build ${DEPENDENCY}/BOOT-INF/lib /app/lib
COPY --from=build ${DEPENDENCY}/META-INF /app/META-INF
COPY --from=build ${DEPENDENCY}/BOOT-INF/classes /app

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/actuator/health/liveness || exit 1

# Java 21 is container-aware. Deployments can replace JAVA_TOOL_OPTIONS when a different heap split
# is required; these defaults retain native/Jasper headroom within the pod memory limit.
ENV JAVA_TOOL_OPTIONS="-XX:InitialRAMPercentage=20.0 -XX:MaxRAMPercentage=60.0"

ENTRYPOINT ["java","-Duser.name=LEXIS-API","-Duser.home=/tmp","-Duser.timezone=America/Vancouver","-Djava.io.tmpdir=/tmp","-Djava.awt.headless=true","-XX:TieredStopAtLevel=1","-XX:+UseParallelGC","-XX:MinHeapFreeRatio=20","-XX:MaxHeapFreeRatio=40","-XX:GCTimeRatio=4","-XX:AdaptiveSizePolicyWeight=90","-XX:ParallelGCThreads=2","-Djava.util.concurrent.ForkJoinPool.common.parallelism=8","-XX:CICompilerCount=2","-XX:+ExitOnOutOfMemoryError","-Djava.security.egd=file:/dev/./urandom","-cp","app:app/lib/*","ca.bc.gov.mof.lexis.LexisApiApplication"]
