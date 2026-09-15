<?php

declare(strict_types=1);

namespace App\Checkout;

final class CartAssembler
{
    public function attach(Cart $cart, Item $item, Grid $grid, Row $row): void
    {
        $cart->add($item);
        $grid->add($row);
    }
}
