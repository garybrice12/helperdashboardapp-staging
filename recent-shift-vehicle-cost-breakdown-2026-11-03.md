# Recent completed shift — vehicle costs and net — v6.0.4.3

- Add vehicle insurance cost to the Recent Completed Shift card for both solo and helper shifts.
- Add net after vehicle costs (gross less fuel and vehicle insurance) for both shift types.
- Preserve helper payout and trip boost as separate fields on helper shifts.
- Fuel: £0.30 per recorded mile.
- Vehicle insurance: £0.01 per recorded mile.
- If mileage or gross is unavailable, show unavailable rather than a misleading £0.00.
- Example: 67.4 miles => £20.22 fuel, £0.67 vehicle insurance; £92.53 gross => £71.64 net after vehicle costs.

Status: 15 automated tests passed. Not deployed. Live visual/API checks remain outstanding.
