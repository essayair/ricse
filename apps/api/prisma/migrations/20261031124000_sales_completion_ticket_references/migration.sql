ALTER TABLE "waybills"
  ADD CONSTRAINT "waybills_salesCompletionCustomerTicketId_fkey" FOREIGN KEY ("salesCompletionCustomerTicketId") REFERENCES "weigh_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "waybills_salesCompletionShippingTicketId_fkey" FOREIGN KEY ("salesCompletionShippingTicketId") REFERENCES "weigh_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
