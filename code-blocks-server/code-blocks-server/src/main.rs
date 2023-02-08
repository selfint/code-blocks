use code_blocks_server::{get_subtrees_endpoint, move_item_endpoint};
use rocket::{launch, routes};

#[launch]
fn rocket() -> _ {
    rocket::build().mount("/", routes![get_subtrees_endpoint, move_item_endpoint])
}
