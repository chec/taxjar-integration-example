import cc from "classcat";

import { useCheckoutState } from "../../context/checkout";

import Button from "../Button";

function CheckoutSummary({
  subtotal,
  shipping,
  line_items = [],
  total,
  live
}) {
  const { processing, error} = useCheckoutState();
  const { tax } = live || {};
  const count = line_items.length;

  const renderTaxSummaryLine = () => {
    if (!tax) {
      return null;
    }

    if (tax.amount.raw === 0) {
      return '0.00';
    }

    if (tax.amount.raw > 0) {
      return tax.amount.formatted_with_symbol;
    }
    return '0.00';
  }

  const renderTotalwithTax = () => {
    if (!total || !tax) {
      return null;
    }

    return total.raw + tax.raw;
  }

  return (
    <div className="py-6">
      <div className="md:flex md:justify-between md:space-x-6">
        <div className="w-full md:w-1/2">
          <ol>
            {subtotal && <li>Subtotal: {subtotal.formatted_with_symbol}</li>}
            <li>Tax: { renderTaxSummaryLine() }</li>
            {shipping && (
              <li>Shipping: {shipping.price.formatted_with_symbol}</li>
            )}
            <li className="text-lg md:text-xl py-3">
              Total: { renderTotalwithTax() }, {count}{" "}
              {count === 1 ? "item" : "items"}
            </li>
          </ol>
        </div>
        <div className="w-full md:w-1/2 md:flex md:items-end md:justify-end">
          <div className="flex items-center space-x-3">
            {error && <span className="text-red-500 text-sm">{error}</span>}
            <Button
              type="submit"
              className={cc([
                "appearance-none leading-none p-1 md:p-2 lg:p-3 text-lg md:text-xl",
                {
                  "opacity-75 cursor-not-allowed": processing,
                },
              ])}
              disabled={processing}
            >
              {processing ? "Processing order" : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CheckoutSummary;
