# API de coleta do Hub

Esta API é a primeira integração entre o executável instalado no computador do cliente e o Hub. Ela está deliberadamente sem autenticação e sem banco de dados para facilitar os testes.

## Endpoint

```text
POST https://SEU-HUB.example.com/api/collections
Content-Type: application/json
```

O servidor também aceita `OPTIONS` para permitir chamadas feitas por um aplicativo desktop. Durante os testes, a API aceita chamadas de qualquer origem. Isso deverá ser restringido quando autenticação for adicionada.

## Envio de uma coleta

O aplicativo deve enviar o JSON diretamente no corpo da requisição. O modelo completo está em [coleta-exemplo.json](./coleta-exemplo.json).

O Hub também interpreta diretamente o formato atualmente emitido pelo aplicativo Windows, identificado por `reportVersion: "1.4"` ou superior, como no arquivo [coleta-exemplo-app-windows-v2.json](./coleta-exemplo-app-windows-v2.json). Não é necessário alterar a função de `POST` do aplicativo neste momento. A API converte:

- `store.storeName` para o nome da loja;
- `store.technicianName` para o responsável pela coleta;
- `store.selectedSystem` para o sistema auditado;
- `system`, `processors`, `memory` e o disco `C:` para os dados de hardware;
- `network.adapter` e `network.downloadMbps` para conectividade e velocidade;
- `peripherals.items` e `peripherals.thermalPrinters` para periféricos.

O campo `collectionId` é preservado como identificador idempotente do registro. Se estiver ausente, a API o gera com o CNPJ e `collectedAtUtc`.

```powershell
$json = Get-Content .\coleta.json -Raw
Invoke-RestMethod `
  -Uri "http://localhost:3000/api/collections" `
  -Method Post `
  -ContentType "application/json" `
  -Body $json
```

Exemplo equivalente em Python:

```python
import json
import urllib.request

with open("coleta.json", "rb") as file:
    request = urllib.request.Request(
        "http://localhost:3000/api/collections",
        data=file.read(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

with urllib.request.urlopen(request) as response:
    print(response.status)
    print(response.read().decode("utf-8"))
```

## Envio em lote

Para testes em lote, o aplicativo pode enviar:

```json
{
  "collections": [
    { "...": "coleta no formato 1.0" },
    { "...": "outra coleta no formato 1.0" }
  ]
}
```

Também é aceito um array JSON na raiz.

## Respostas

Sucesso:

```json
{
  "message": "Coleta(s) recebida(s) e auditada(s).",
  "count": 1,
  "records": [
    {
      "id": "loja-12345678000190-20260914T210000Z",
      "system": "TasteOne PDV",
      "status": "APROVADO"
    }
  ]
}
```

Erro de contrato:

```json
{
  "error": "Uma ou mais coletas não atendem ao contrato JSON.",
  "details": [
    {
      "index": 0,
      "errors": ["collector.name é obrigatório."]
    }
  ],
  "received": 0
}
```

O aplicativo deve considerar HTTP `201` como sucesso e `400` como erro de validação. Erros de rede ou HTTP diferente de `201` devem ser registrados para reenvio posterior. Como `collectionId` é idempotente, reenviar a mesma coleta atualiza o registro em vez de duplicá-lo.

## Consulta para o Hub

```text
GET http://localhost:3000/api/collections
```

Resposta:

```json
{
  "count": 1,
  "records": [
    {
      "id": "...",
      "system": "TasteOne PDV",
      "status": "APROVADO",
      "storeName": "Casa do Sabor",
      "cnpj": "12.345.678/0001-90",
      "collectedBy": "Mariana Costa",
      "report": "...",
      "checks": []
    }
  ]
}
```

## Contrato do JSON `schemaVersion: 1.0`

| Campo | Obrigatório | Descrição |
|---|---:|---|
| `schemaVersion` | Sim | Deve ser exatamente `1.0`. |
| `collectionId` | Sim | Identificador único gerado pelo aplicativo. |
| `collectedAt` | Sim | Data/hora UTC em ISO 8601. |
| `store.cnpj` | Sim | CNPJ da loja. |
| `store.tradeName` | Sim | Nome fantasia. |
| `system` | Sim | `TasteOne PDV`, `TasteOne Autoatendimento` ou `Degust PDV`. |
| `collector.name` | Sim | Pessoa que executou a coleta. |
| `collector.email` | Não | E-mail do responsável. |
| `collector.appVersion` | Não | Versão do executável. |
| `hardware.*` | Não | Dados coletados de sistema operacional e hardware. |
| `network.*` | Não | Dados de conectividade e internet. |
| `peripherals` | Não | Lista de periféricos detectados. |
| `metadata` | Não | Campos adicionais simples do coletor. |

### Formato atual do aplicativo Windows

O payload `reportVersion: "1.5"` pode ser enviado sem conversão:

```json
{
  "reportVersion": "1.4",
  "collectedAtUtc": "2026-09-15T18:43:10.2942724Z",
  "store": {
    "storeName": "Casona Açai",
    "cnpj": "99999999999999",
    "technicianName": "FELIPE",
    "selectedSystem": "TasteOne PDV"
  },
  "system": {
    "operatingSystem": "Microsoft Windows 11 Pro"
  },
  "processors": [
    { "model": "AMD Ryzen 5 5500", "cores": 6, "threads": 12 }
  ],
  "memory": { "totalGb": 16 },
  "storage": [
    { "driveLetter": "C:", "storageType": "NVMe SSD", "totalGb": 464.86 }
  ],
  "network": {
    "adapter": "Ethernet",
    "downloadMbps": 390.39,
    "internetReachable": true
  }
}
```

O exemplo completo permanece no arquivo referenciado acima.

## Fluxo recomendado no executável

1. Gerar `collectionId` único, por exemplo `{cnpj sem pontuação}-{timestamp UTC}`.
2. Coletar os dados da loja preenchidos pelo usuário.
3. Coletar hardware, rede e periféricos sem inventar valores indisponíveis.
4. Montar o JSON seguindo `schemaVersion: "1.0"`.
5. Enviar com `POST /api/collections`.
6. Se receber `201`, marcar a coleta como enviada e guardar o `collectionId`.
7. Se receber `400`, mostrar os campos rejeitados ao usuário e não descartar o arquivo.
8. Se houver falha de rede, manter o JSON localmente e permitir reenvio.

## Limitação desta fase

As coletas são mantidas em memória no processo do servidor. Reiniciar o servidor, redeployar ou escalar para outra instância pode apagar ou separar os registros. Isso é intencional para o ambiente de teste; a próxima etapa deve adicionar banco, autenticação e fila de auditoria.
