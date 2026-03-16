from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.core.clock import naive_utc_now
from app.models.schemas import BrokerAdapterSnapshotView, BrokerBalanceView, BrokerFillImportView, BrokerPositionView


class BrokerReadOnlyAdapter(Protocol):
    def snapshot(self) -> BrokerAdapterSnapshotView: ...


@dataclass(slots=True)
class MockBrokerAdapter:
    venue: str = "mock_broker"

    def snapshot(self) -> BrokerAdapterSnapshotView:
        generated_at = naive_utc_now()
        return BrokerAdapterSnapshotView(
            generated_at=generated_at,
            balances=[
                BrokerBalanceView(
                    venue=self.venue,
                    account_label="shadow_book",
                    asset="USD",
                    free=25000.0,
                    locked=0.0,
                    usd_value=25000.0,
                    source_type="fixture",
                ),
                BrokerBalanceView(
                    venue=self.venue,
                    account_label="shadow_book",
                    asset="BTC",
                    free=0.18,
                    locked=0.0,
                    usd_value=12960.0,
                    source_type="fixture",
                ),
            ],
            positions=[
                BrokerPositionView(
                    venue=self.venue,
                    symbol="BTC",
                    side="long",
                    size=0.18,
                    entry_price=70120.0,
                    mark_price=71880.0,
                    unrealized_pnl_pct=2.51,
                    source_type="fixture",
                ),
            ],
            fill_imports=[
                BrokerFillImportView(
                    venue=self.venue,
                    import_batch_id="import_shadow_001",
                    fill_count=1,
                    latest_fill_at=generated_at,
                    notes="Fixture-safe imported fill batch for reconciliation testing.",
                    source_type="fixture",
                )
            ],
        )


def default_broker_adapter() -> BrokerReadOnlyAdapter:
    return MockBrokerAdapter()
