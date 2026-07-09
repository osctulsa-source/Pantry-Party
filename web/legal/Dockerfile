# Static legal pages (Privacy Policy + Terms) for Pantry Party.
# Deployed to Railway as the `legal` service: `railway up web/legal --path-as-root --service legal`
# Regenerate site/ from docs/legal/*.md before deploying (see web/legal/README.md).
FROM nginx:alpine
COPY site /usr/share/nginx/html
EXPOSE 80
