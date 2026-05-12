FROM nginx:1.27-alpine

# apache2-utils provides htpasswd for generating basic-auth credential files
RUN apk add --no-cache apache2-utils

COPY nginx.conf        /etc/nginx/nginx.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
