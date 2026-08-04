FROM alpine:3.21

RUN apk add --no-cache lighttpd

COPY apps/client/dist /var/www/localhost/htdocs
COPY apps/client/lighttpd.conf /etc/lighttpd/lighttpd.conf

EXPOSE 80

CMD ["lighttpd", "-D", "-f", "/etc/lighttpd/lighttpd.conf"]
