# Usar una imagen oficial de Go para compilar
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Copiar los archivos de dependencias y descargarlas
COPY go.mod go.sum ./
RUN go mod download

# Copiar el resto del código (incluyendo main/servidor.go)
COPY . .

# Compilar el servidor
# Ajusta la ruta si tu main está en otra carpeta (ej: ./main/servidor.go)
RUN CGO_ENABLED=0 GOOS=linux go build -o /servidor-bin ./main/servidor.go

# Imagen final ligera
FROM alpine:latest
WORKDIR /app
COPY --from=builder /servidor-bin /app/servidor-bin

# Exponer el puerto que usa tu servidor (según tu guía, 50051)
EXPOSE 50051

# Comando para ejecutar el servidor
CMD ["/app/servidor-bin"]