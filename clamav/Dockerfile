FROM registry.access.redhat.com/ubi9/ubi:9.6

ARG CLAMAV_VERSION=1.5.3

LABEL name="nr-lexis-clamav" \
      vendor="Province of British Columbia" \
      version="${CLAMAV_VERSION}" \
      summary="ClamAV daemon for NR LEXIS uploads"

RUN dnf -y update \
    && dnf -y install \
      "https://www.clamav.net/downloads/production/clamav-${CLAMAV_VERSION}.linux.x86_64.rpm" \
      ca-certificates \
      nmap-ncat \
    && dnf clean all \
    && rm -rf /var/cache/dnf

COPY config/clamd.conf /usr/local/etc/clamd.conf
COPY config/freshclam.conf /usr/local/etc/freshclam.conf
COPY clamdcheck.sh /opt/app-root/clamdcheck.sh

RUN mkdir -p /opt/app-root/src /var/log/clamav /tmp/clamav \
    && touch /var/log/clamav/clamav.log /var/log/clamav/freshclam.log \
    && chown -R 1001:0 /opt/app-root /var/log/clamav /tmp/clamav \
    && chmod -R ug+rwx /opt/app-root /var/log/clamav /tmp/clamav

USER 1001

EXPOSE 3310

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=5 \
  CMD /opt/app-root/clamdcheck.sh || exit 1

CMD ["sh", "-c", "freshclam && exec clamd"]
