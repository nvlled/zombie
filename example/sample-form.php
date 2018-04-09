<?php

if (@$_REQUEST["action"]) {
    $username = @$_REQUEST["username"];
    $password = @$_REQUEST["password"];
    echo "Your username is $username and your password is $password<br";
}
?>

<form method="">
    <p> username: <input name="username"></p>
    <p> password: <input name="password" type="password"></p>
    <input name="action" type="submit">
</form>

