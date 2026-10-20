# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY CardApi/CardApi.csproj CardApi/
COPY CardApi.Tests/CardApi.Tests.csproj CardApi.Tests/
RUN dotnet restore CardApi.Tests/CardApi.Tests.csproj
COPY . .

# `docker build --target test backend` runs the unit tests
FROM build AS test
RUN dotnet test CardApi.Tests/CardApi.Tests.csproj --logger "console;verbosity=normal"

FROM build AS publish
RUN dotnet publish CardApi/CardApi.csproj -c Release -o /out

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=publish /out .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "CardApi.dll"]
