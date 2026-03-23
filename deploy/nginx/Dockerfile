FROM nginx:1.27-alpine

RUN apk add --no-cache bash gettext

COPY deploy/nginx/docker-entrypoint.sh /usr/local/bin/ai-trader-nginx-entrypoint
COPY deploy/nginx/http.conf.template /etc/ai-trader/templates/http.conf.template
COPY deploy/nginx/https.conf.template /etc/ai-trader/templates/https.conf.template

RUN chmod +x /usr/local/bin/ai-trader-nginx-entrypoint \
  && rm -f /etc/nginx/conf.d/default.conf \
  && mkdir -p /var/www/certbot /etc/nginx/certs /etc/ai-trader/templates

ENTRYPOINT ["/usr/local/bin/ai-trader-nginx-entrypoint"]
